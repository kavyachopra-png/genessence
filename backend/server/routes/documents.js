const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { serializeDocument } = require('../utils/serializers');
const { protect, authorize } = require('../middleware/auth');

// Setup storage directory
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter (PDF, DOCX, XLSX, Images, ZIP)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for: ${file.originalname}. Allowed: PDF, DOCX, XLSX, Images, ZIP`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// @route   POST api/documents/upload
// @desc    Upload project document files (multiple support)
// @access  Private (Admin, Manager)
router.post('/upload', protect, authorize(['admin', 'manager']), (req, res) => {
  upload.array('files', 10)(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const { projectId } = req.body;
    if (!projectId) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
      return res.status(400).json({ message: 'Project ID is required' });
    }

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!project) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
        return res.status(404).json({ message: 'Project not found' });
      }

      const uploadedDocs = [];
      for (const file of req.files) {
        const doc = await prisma.document.create({
          data: {
            projectId,
            fileName: file.filename,
            originalName: file.originalname,
            filePath: file.path,
            fileType: path.extname(file.originalname).toLowerCase(),
            fileSize: file.size,
            uploadedBy: req.user.name
          },
          include: {
            project: {
              select: {
                id: true,
                projectName: true,
                projectNumber: true,
                spocs: true
              }
            },
            versions: { orderBy: { uploadedAt: 'desc' } }
          }
        });
        uploadedDocs.push(serializeDocument(doc));
      }

      res.status(201).json(uploadedDocs);
    } catch (saveErr) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
      res.status(500).json({ message: saveErr.message });
    }
  });
});

// @route   GET api/documents
// @desc    Get all documents or filter by project / search
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { projectId, search = '' } = req.query;
    const query = {};

    if (projectId) {
      query.projectId = projectId;
    }

    if (search) {
      query.originalName = { contains: search, mode: 'insensitive' };
    }

    const documents = await prisma.document.findMany({
      where: query,
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            projectNumber: true,
            spocs: true
          }
        },
        versions: { orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json(documents.map(serializeDocument));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/documents/recent
// @desc    Get recent uploaded documents
// @access  Private
router.get('/recent', protect, async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            projectNumber: true,
            spocs: true
          }
        },
        versions: { orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { uploadedAt: 'desc' },
      take: 5
    });
    res.json(documents.map(serializeDocument));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/documents/download/:id
// @desc    Download specific document file
// @access  Private
router.get('/download/:id', protect, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    res.download(doc.filePath, doc.originalName);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/documents/preview/:id
// @desc    Preview document inline (PDF or Images)
// @access  Private
router.get('/preview/:id', protect, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    const contentTypeMap = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    const contentType = contentTypeMap[doc.fileType.toLowerCase()];
    if (!contentType) {
      return res.status(400).json({ message: 'File type does not support inline preview' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    fs.createReadStream(doc.filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/documents/:id
// @desc    Get single document details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            projectNumber: true,
            spocs: true
          }
        },
        versions: { orderBy: { uploadedAt: 'desc' } }
      }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }
    res.json(serializeDocument(doc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PUT api/documents/:id
// @desc    Update document metadata (name, description, tags, version note)
// @access  Private (Admin, Manager)
router.put('/:id', protect, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const { originalName, description, tags, versionNote, projectId } = req.body;

    // If moving to a different project, verify that project exists
    let nextProjectId = doc.projectId;
    if (projectId && projectId !== String(doc.projectId)) {
      const projectExists = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (!projectExists) {
        return res.status(404).json({ message: 'Target project not found' });
      }
      nextProjectId = projectId;
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        projectId: nextProjectId,
        originalName: originalName && originalName.trim() ? originalName.trim() : doc.originalName,
        description: description !== undefined ? description : doc.description,
        tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : doc.tags,
        versionNote: versionNote !== undefined ? versionNote : doc.versionNote
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            projectNumber: true,
            spocs: true
          }
        },
        versions: { orderBy: { uploadedAt: 'desc' } }
      }
    });
    res.json(serializeDocument(updated));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST api/documents/replace/:id
// @desc    Replace the physical file, keeping version history
// @access  Private (Admin, Manager)
router.post('/replace/:id', protect, authorize(['admin', 'manager']), (req, res) => {
  upload.single('file')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No replacement file provided' });
    }

    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id }
      });
      if (!doc) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Document not found' });
      }

      await prisma.documentVersion.create({
        data: {
          documentId: doc.id,
          fileName: doc.fileName,
          filePath: doc.filePath,
          fileSize: doc.fileSize,
          fileType: doc.fileType,
          uploadedBy: doc.uploadedBy,
          uploadedAt: doc.uploadedAt,
          versionNote: req.body.versionNote || `Replaced on ${new Date().toLocaleDateString()}`
        }
      });

      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: {
          fileName: req.file.filename,
          filePath: req.file.path,
          fileSize: req.file.size,
          fileType: path.extname(req.file.originalname).toLowerCase(),
          uploadedBy: req.user.name,
          uploadedAt: new Date(),
          originalName: req.body.originalName || doc.originalName
        },
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              projectNumber: true,
              spocs: true
            }
          },
          versions: { orderBy: { uploadedAt: 'desc' } }
        }
      });
      res.json(serializeDocument(updated));
    } catch (saveErr) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ message: saveErr.message });
    }
  });
});

// @route   DELETE api/documents/:id
// @desc    Delete a document file and DB record (Admin only)
// @access  Private (Admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { versions: true }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Delete the main file from disk
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    // Also clean up any archived version files from disk
    for (const ver of doc.versions) {
      if (ver.filePath && fs.existsSync(ver.filePath)) {
        try { fs.unlinkSync(ver.filePath); } catch (_) {}
      }
    }

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ message: 'Document removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
