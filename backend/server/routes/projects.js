const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { statusToDb, statusFromDb, serializeProject, serializeDocument } = require('../utils/serializers');
const { protect, authorize } = require('../middleware/auth');

const sortFieldMap = {
  createdAt: 'createdAt',
  projectNumber: 'projectNumber',
  projectName: 'projectName',
  scopeDoc: 'scopeDoc',
  projectAmount: 'projectAmount',
  projectStatus: 'projectStatus',
  projectManager: 'projectManager',
  startDate: 'startDate',
  endDate: 'endDate'
};

// @route   GET api/projects
// @desc    Get all projects with search, filter, sorting, and pagination
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1, 
      limit = 10, 
      search = '', 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      status,
      company,
      manager,
      spoc,
      projectName
    } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { scopeDoc: { contains: search, mode: 'insensitive' } },
        { projectNumber: { contains: search, mode: 'insensitive' } },
        { projectManager: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status) {
      where.projectStatus = statusToDb(status);
    }
    if (company) {
      where.scopeDoc = { contains: company, mode: 'insensitive' };
    }
    if (manager) {
      where.projectManager = { contains: manager, mode: 'insensitive' };
    }
    if (spoc) {
      where.spocs = { has: spoc };
    }
    if (projectName) {
      where.projectName = { contains: projectName, mode: 'insensitive' };
    }

    const sortField = sortFieldMap[sortBy] || 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    const [totalProjects, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: { [sortField]: sortDirection },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      })
    ]);

    const projectIds = projects.map((p) => p.id);
    const fileCountRows = projectIds.length
      ? await prisma.document.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: { _all: true }
        })
      : [];
    const countMap = new Map(fileCountRows.map((row) => [row.projectId, row._count._all]));

    const projectsWithCounts = projects.map((proj) => ({
      ...serializeProject(proj),
      fileCount: countMap.get(proj.id) || 0
    }));

    const [companiesRaw, managersRaw, projectNamesRaw, spocRows] = await Promise.all([
      prisma.project.findMany({ distinct: ['scopeDoc'], select: { scopeDoc: true } }),
      prisma.project.findMany({ distinct: ['projectManager'], select: { projectManager: true } }),
      prisma.project.findMany({ distinct: ['projectName'], select: { projectName: true } }),
      prisma.project.findMany({ select: { spocs: true } })
    ]);
    const spocSet = new Set(spocRows.flatMap((row) => row.spocs));

    res.json({
      projects: projectsWithCounts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalProjects / Number(limit)),
        totalProjects
      },
      filters: {
        companies: companiesRaw.map((x) => x.scopeDoc),
        managers: managersRaw.map((x) => x.projectManager),
        spocs: [...spocSet],
        projectNames: projectNamesRaw.map((x) => x.projectName)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/projects/stats
// @desc    Get dashboard KPIs in Indian Currency (INR) formatted fields
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const [
      totalProjects,
      totalValueAgg,
      activeValueAgg,
      completedValueAgg,
      pendingValueAgg,
      activeCount,
      completedCount,
      pendingCount,
      statusCountsRaw,
      managerCountsRaw,
      recentProjects,
      spocRows,
      companyRows
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.aggregate({ _sum: { projectAmount: true } }),
      prisma.project.aggregate({ where: { projectStatus: 'InProgress' }, _sum: { projectAmount: true } }),
      prisma.project.aggregate({ where: { projectStatus: 'Completed' }, _sum: { projectAmount: true } }),
      prisma.project.aggregate({
        where: { projectStatus: { in: ['Planning', 'OnHold', 'Cancelled'] } },
        _sum: { projectAmount: true }
      }),
      prisma.project.count({ where: { projectStatus: 'InProgress' } }),
      prisma.project.count({ where: { projectStatus: 'Completed' } }),
      prisma.project.count({ where: { projectStatus: { in: ['Planning', 'OnHold', 'Cancelled'] } } }),
      prisma.project.groupBy({ by: ['projectStatus'], _count: { _all: true } }),
      prisma.project.groupBy({
        by: ['projectManager'],
        _count: { _all: true },
        _sum: { projectAmount: true },
        orderBy: { _count: { projectManager: 'desc' } },
        take: 5
      }),
      prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.project.findMany({ select: { spocs: true } }),
      prisma.project.findMany({ distinct: ['scopeDoc'], select: { scopeDoc: true } })
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const monthlyTrends = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "startDate") AS month,
        SUM("projectAmount")::float8 AS "totalAmount",
        COUNT(*)::int AS count
      FROM "Project"
      WHERE "startDate" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "startDate")
      ORDER BY DATE_TRUNC('month', "startDate") ASC
    `;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedTrends = monthlyTrends.map(trend => {
      const monthDate = new Date(trend.month);
      const monthIndex = monthDate.getMonth();
      return {
        month: `${monthNames[monthIndex]} ${monthDate.getFullYear()}`,
        value: Number(trend.totalAmount || 0),
        projectsCount: trend.count
      };
    });

    const totalSpocs = new Set(spocRows.flatMap((row) => row.spocs)).size;
    const totalCompanies = companyRows.length;

    res.json({
      totalProjects,
      totalSpocs,
      totalCompanies,
      totalValue: totalValueAgg._sum.projectAmount || 0,
      activeValue: activeValueAgg._sum.projectAmount || 0,
      completedValue: completedValueAgg._sum.projectAmount || 0,
      pendingValue: pendingValueAgg._sum.projectAmount || 0,
      activeCount,
      completedCount,
      pendingCount,
      statusCounts: statusCountsRaw.reduce((acc, curr) => {
        acc[statusFromDb(curr.projectStatus)] = curr._count._all;
        return acc;
      }, {}),
      managerCounts: managerCountsRaw.map(m => ({
        manager: m.projectManager,
        count: m._count._all,
        totalValue: m._sum.projectAmount || 0
      })),
      monthlyTrends: formattedTrends,
      recentProjects: recentProjects.map(serializeProject)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/projects/export
// @desc    Get all projects for export
// @access  Private
router.get('/export', protect, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(projects.map(serializeProject));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/projects/:id
// @desc    Get project details with attached files list
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const documents = await prisma.document.findMany({
      where: { projectId: project.id },
      include: { versions: { orderBy: { uploadedAt: 'desc' } } },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json({
      ...serializeProject(project),
      documents: documents.map(serializeDocument)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST api/projects
// @desc    Create a new project
// @access  Private (Admin, Manager)
router.post('/', protect, authorize(['admin', 'manager']), async (req, res) => {
  const {
    projectName,
    spocs,
    scopeDoc,
    projectNumber,
    projectAmount,
    projectStatus,
    projectManager,
    description,
    startDate,
    endDate
  } = req.body;

  if (!projectName || !spocs || !Array.isArray(spocs) || spocs.length === 0 || !scopeDoc || !projectNumber || !projectAmount || !projectManager || !startDate || !endDate) {
    return res.status(400).json({ message: 'Please provide all required fields, including at least one SPOC' });
  }

  try {
    const numExists = await prisma.project.findUnique({
      where: { projectNumber }
    });
    if (numExists) {
      return res.status(400).json({ message: 'Project number must be unique' });
    }

    const project = await prisma.project.create({
      data: {
        projectName,
        spocs,
        scopeDoc,
        projectNumber,
        projectAmount: Number(projectAmount),
        projectStatus: statusToDb(projectStatus || 'Planning'),
        projectManager,
        description: description || '',
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      }
    });

    res.status(201).json(serializeProject(project));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST api/projects/import
// @desc    Bulk import projects from Excel rows
// @access  Private (Admin, Manager)
router.post('/import', protect, authorize(['admin', 'manager']), async (req, res) => {
  const { projects } = req.body;

  if (!Array.isArray(projects) || projects.length === 0) {
    return res.status(400).json({ message: 'Please provide a valid array of projects to import' });
  }

  try {
    const importedProjects = [];
    const errors = [];

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      
      const name = p.projectName || p.spoc;
      let spocsList = [];
      if (p.spocs) {
        if (Array.isArray(p.spocs)) {
          spocsList = p.spocs.map(s => String(s).trim()).filter(Boolean);
        } else if (typeof p.spocs === 'string') {
          spocsList = p.spocs.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (p.spoc) {
        // If legacy spoc is provided but no separate spocs, use the manager or a default SPOC
        spocsList = [p.projectManager || 'System'];
      }

      if (!name || spocsList.length === 0 || !p.scopeDoc || !p.projectNumber || p.projectAmount === undefined || !p.projectManager) {
        errors.push(`Row ${i + 1}: Missing required fields (Project Name, SPOC, Scope Doc, Project Number, Amount, Manager).`);
        continue;
      }

      const existingProject = await prisma.project.findUnique({
        where: { projectNumber: String(p.projectNumber) }
      });
      if (existingProject) {
        errors.push(`Row ${i + 1}: Project Number '${p.projectNumber}' already exists.`);
        continue;
      }

      const start = new Date(p.startDate || new Date());
      const end = new Date(p.endDate || new Date());

      try {
        const newProj = await prisma.project.create({
          data: {
            projectName: name,
            spocs: spocsList,
            scopeDoc: p.scopeDoc,
            projectNumber: String(p.projectNumber),
            projectAmount: Number(p.projectAmount),
            projectStatus: statusToDb(p.projectStatus || 'Planning'),
            projectManager: p.projectManager,
            description: p.description || '',
            startDate: isNaN(start.getTime()) ? new Date() : start,
            endDate: isNaN(end.getTime()) ? new Date() : end
          }
        });
        importedProjects.push(newProj);
      } catch (saveErr) {
        errors.push(`Row ${i + 1}: Save error - ${saveErr.message}`);
      }
    }

    res.json({
      successCount: importedProjects.length,
      failedCount: errors.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PUT api/projects/:id
// @desc    Update a project
// @access  Private (Admin, Manager)
router.put('/:id', protect, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const {
      projectName,
      spocs,
      scopeDoc,
      projectNumber,
      projectAmount,
      projectStatus,
      projectManager,
      description,
      startDate,
      endDate
    } = req.body;

    let nextProjectNumber = project.projectNumber;
    if (projectNumber && projectNumber !== project.projectNumber) {
      const numExists = await prisma.project.findUnique({
        where: { projectNumber }
      });
      if (numExists) {
        return res.status(400).json({ message: 'Project number must be unique' });
      }
      nextProjectNumber = projectNumber;
    }

    const updatedProject = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        projectName: projectName || project.projectName,
        spocs: spocs && Array.isArray(spocs) && spocs.length > 0 ? spocs : project.spocs,
        scopeDoc: scopeDoc || project.scopeDoc,
        projectNumber: nextProjectNumber,
        projectAmount: projectAmount !== undefined ? Number(projectAmount) : project.projectAmount,
        projectStatus: projectStatus ? statusToDb(projectStatus) : project.projectStatus,
        projectManager: projectManager || project.projectManager,
        description: description !== undefined ? description : project.description,
        startDate: startDate ? new Date(startDate) : project.startDate,
        endDate: endDate ? new Date(endDate) : project.endDate
      }
    });
    res.json(serializeProject(updatedProject));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE api/projects/:id
// @desc    Delete a project and its attached files
// @access  Private (Admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  const fs = require('fs');
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const documents = await prisma.document.findMany({
      where: { projectId: project.id },
      include: { versions: true }
    });
    for (const doc of documents) {
      if (fs.existsSync(doc.filePath)) {
        fs.unlinkSync(doc.filePath);
      }
      for (const ver of doc.versions) {
        if (ver.filePath && fs.existsSync(ver.filePath)) {
          try { fs.unlinkSync(ver.filePath); } catch (_) {}
        }
      }
    }
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project and all attached documents removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
