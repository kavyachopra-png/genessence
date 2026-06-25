const STATUS_TO_DB = {
  Planning: 'Planning',
  'In Progress': 'InProgress',
  'On Hold': 'OnHold',
  Completed: 'Completed',
  Cancelled: 'Cancelled'
};

const STATUS_FROM_DB = {
  Planning: 'Planning',
  InProgress: 'In Progress',
  OnHold: 'On Hold',
  Completed: 'Completed',
  Cancelled: 'Cancelled'
};

const roleToDb = (role) => String(role || '').toLowerCase();

const roleFromDb = (role) => String(role || '').toLowerCase();

const statusToDb = (status) => STATUS_TO_DB[status] || 'Planning';

const statusFromDb = (status) => STATUS_FROM_DB[status] || 'Planning';

const serializeUser = (user) => ({
  _id: user.id,
  name: user.name,
  email: user.email,
  role: roleFromDb(user.role),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const serializeProject = (project) => ({
  _id: project.id,
  projectName: project.projectName,
  spocs: project.spocs,
  scopeDoc: project.scopeDoc,
  projectNumber: project.projectNumber,
  projectAmount: project.projectAmount,
  projectStatus: statusFromDb(project.projectStatus),
  projectManager: project.projectManager,
  description: project.description || '',
  startDate: project.startDate,
  endDate: project.endDate,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt
});

const serializeVersion = (version) => ({
  _id: version.id,
  fileName: version.fileName,
  filePath: version.filePath,
  fileSize: version.fileSize,
  fileType: version.fileType,
  uploadedBy: version.uploadedBy,
  uploadedAt: version.uploadedAt,
  versionNote: version.versionNote || ''
});

const serializeDocument = (doc) => ({
  _id: doc.id,
  projectId: doc.project
    ? {
        _id: doc.project.id,
        projectName: doc.project.projectName,
        projectNumber: doc.project.projectNumber,
        spocs: doc.project.spocs
      }
    : doc.projectId,
  fileName: doc.fileName,
  originalName: doc.originalName,
  filePath: doc.filePath,
  fileType: doc.fileType,
  fileSize: doc.fileSize,
  uploadedBy: doc.uploadedBy,
  uploadedAt: doc.uploadedAt,
  description: doc.description || '',
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  versionNote: doc.versionNote || '',
  versions: Array.isArray(doc.versions) ? doc.versions.map(serializeVersion) : []
});

module.exports = {
  roleToDb,
  roleFromDb,
  statusToDb,
  statusFromDb,
  serializeUser,
  serializeProject,
  serializeDocument
};
