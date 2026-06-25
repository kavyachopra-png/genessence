require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');
const { roleToDb, statusToDb } = require('./utils/serializers');

const users = [
  {
    name: 'System Administrator',
    email: 'admin@genessence.com',
    password: 'admin123',
    role: 'admin'
  },
  {
    name: 'Project Manager',
    email: 'manager@genessence.com',
    password: 'manager123',
    role: 'manager'
  },
  {
    name: 'Guest Viewer',
    email: 'viewer@genessence.com',
    password: 'viewer123',
    role: 'viewer'
  }
];

const projects = [
  {
    projectName: 'Alpha Research & Diagnostics Integration',
    spocs: ['Kavya Chopra', 'Karan'],
    scopeDoc: 'Alpha Scope Document v1.2',
    projectNumber: 'GPMP-001',
    projectAmount: 1250000,
    projectStatus: 'In Progress',
    projectManager: 'Kavya Chopra',
    description: 'R&D initiative integrating genome diagnostics flow with central patient portal.',
    startDate: new Date('2026-01-10'),
    endDate: new Date('2026-12-20')
  },
  {
    projectName: 'Beta Biotech Clinical Phase 2',
    spocs: ['Sarah Jenkins', 'Abhishek'],
    scopeDoc: 'Immunology Phase 2 Trials Plan',
    projectNumber: 'GPMP-002',
    projectAmount: 3450000,
    projectStatus: 'In Progress',
    projectManager: 'Sarah Jenkins',
    description: 'Clinical evaluation monitoring for secondary immunology booster vaccines.',
    startDate: new Date('2026-03-01'),
    endDate: new Date('2027-06-30')
  },
  {
    projectName: 'Gamma Sequence Analytics Platform',
    spocs: ['John Davis', 'Girish'],
    scopeDoc: 'Gamma Sequencing Software Req Spec',
    projectNumber: 'GPMP-003',
    projectAmount: 890000,
    projectStatus: 'Completed',
    projectManager: 'John Davis',
    description: 'Custom bio-informatics sequencing analytical tool implementation and QA rollout.',
    startDate: new Date('2025-06-15'),
    endDate: new Date('2026-05-30')
  },
  {
    projectName: 'Delta Immunology Trials & Compliance',
    spocs: ['Emily Smith'],
    scopeDoc: 'Delta Safety Audit Protocol v4',
    projectNumber: 'GPMP-004',
    projectAmount: 4120000,
    projectStatus: 'On Hold',
    projectManager: 'Emily Smith',
    description: 'Regulatory audit coordination and safety profile tracking across multiple trials.',
    startDate: new Date('2026-02-15'),
    endDate: new Date('2027-02-15')
  },
  {
    projectName: 'Epsilon Genetic Mapping Core v3',
    spocs: ['David Miller'],
    scopeDoc: 'High Throughput Mapping Proposal',
    projectNumber: 'GPMP-005',
    projectAmount: 620000,
    projectStatus: 'Planning',
    projectManager: 'David Miller',
    description: 'Initiation and planning of new high-throughput computing nodes for gene alignment.',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2027-04-30')
  },
  {
    projectName: 'Pricing Phase 2',
    spocs: ['Karan'],
    scopeDoc: 'Pricing Strategy Scope v2.1',
    projectNumber: 'GPMP-006',
    projectAmount: 2450000,
    projectStatus: 'In Progress',
    projectManager: 'Kavya Chopra',
    description: 'Phase 2 of global pricing structure refactoring and automated invoice validation.',
    startDate: new Date('2026-04-10'),
    endDate: new Date('2026-11-30')
  },
  {
    projectName: 'Transport',
    spocs: ['Karan'],
    scopeDoc: 'Logistics and Fleet Safety Protocol',
    projectNumber: 'GPMP-007',
    projectAmount: 1850000,
    projectStatus: 'Planning',
    projectManager: 'Emily Smith',
    description: 'Optimization of shipping and logistics networks across multi-region depots.',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-03-31')
  },
  {
    projectName: 'AICM',
    spocs: ['Karan', 'Abhishek'],
    scopeDoc: 'AICM Integration Blueprint v1',
    projectNumber: 'GPMP-008',
    projectAmount: 4200000,
    projectStatus: 'On Hold',
    projectManager: 'Sarah Jenkins',
    description: 'AI-driven Customer Relationship Management tool deployment and employee training.',
    startDate: new Date('2026-02-15'),
    endDate: new Date('2026-12-15')
  },
  {
    projectName: 'NPD',
    spocs: ['Girish'],
    scopeDoc: 'New Product Development Flow',
    projectNumber: 'GPMP-009',
    projectAmount: 3100000,
    projectStatus: 'Completed',
    projectManager: 'John Davis',
    description: 'R&D cycle for next-generation bio-sensor devices validation and safety trials.',
    startDate: new Date('2025-08-01'),
    endDate: new Date('2026-06-15')
  },
  {
    projectName: 'Capex',
    spocs: ['Abhishek'],
    scopeDoc: 'Capital Expenditure Budget Plan 2026',
    projectNumber: 'GPMP-010',
    projectAmount: 7500000,
    projectStatus: 'In Progress',
    projectManager: 'David Miller',
    description: 'Capital expenditure deployment for high-performance lab equipment and new cleanrooms.',
    startDate: new Date('2026-01-15'),
    endDate: new Date('2026-12-31')
  }
];

// Parse the target host from DATABASE_URL, masking any embedded password,
// so a destructive run clearly announces what it is about to wipe.
const describeTarget = () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(DATABASE_URL not set)';
  try {
    const url = new URL(raw);
    if (url.password) url.password = '****';
    const auth = url.username ? `${url.username}${url.password ? ':' + url.password : ''}@` : '';
    const db = url.pathname || '';
    return `${url.protocol}//${auth}${url.host}${db}`;
  } catch (_e) {
    // Fall back to a coarse mask if the URL is not parseable.
    return raw.replace(/:\/\/([^:@/]+):[^@/]+@/, '://$1:****@');
  }
};

const seedData = async ({ reset = false } = {}) => {
  try {
    if (reset) {
      console.warn(`⚠️  DESTRUCTIVE SEED (--reset): purging ALL records on target → ${describeTarget()}`);
      await prisma.documentVersion.deleteMany();
      await prisma.document.deleteMany();
      await prisma.project.deleteMany();
      await prisma.user.deleteMany();
      console.log('Purging existing database records...');
    }

    let usersCreated = 0;
    for (const user of users) {
      const email = user.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        console.log(` - Role [${user.role}]: ${email} (exists, untouched)`);
        continue;
      }
      await prisma.user.create({
        data: {
          name: user.name,
          email,
          password: await bcrypt.hash(user.password, 10),
          role: roleToDb(user.role)
        }
      });
      usersCreated += 1;
      console.log(` - Role [${user.role}]: ${email} (created, password: ${user.password})`);
    }
    console.log(`Users: ${usersCreated} created, ${users.length - usersCreated} already existed.`);

    let projectsCreated = 0;
    for (const project of projects) {
      const existing = await prisma.project.findUnique({
        where: { projectNumber: project.projectNumber }
      });
      await prisma.project.upsert({
        where: { projectNumber: project.projectNumber },
        update: {},
        create: {
          ...project,
          projectStatus: statusToDb(project.projectStatus)
        }
      });
      if (!existing) projectsCreated += 1;
    }
    console.log(`Projects: ${projectsCreated} created, ${projects.length - projectsCreated} already existed.`);
    console.log('Database Seeding Complete.');
  } catch (err) {
    console.error(`Error seeding database: ${err.message}`);
    throw err;
  }
};

// If run directly
if (require.main === module) {
  const reset = process.argv.includes('--reset');
  seedData({ reset })
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`Direct seed failed: ${err.message}`);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = seedData;
