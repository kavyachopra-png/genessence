# Migration Design: MongoDB/Mongoose → PostgreSQL/Prisma (TypeScript) on Render

Status: Approved (design) — 2026-06-26
Scope: Backend (`backend/server`) data layer + file storage + deploy. Frontend stays unchanged.

## 1. Goal & constraints

Migrate the Genessence backend from MongoDB/Mongoose to PostgreSQL using Prisma,
convert the backend to TypeScript (strict), integrate persistent file storage
(Cloudinary) to replace Render's ephemeral disk, and prepare a Render deployment.

Hard constraints:
- Minimal, safe, incremental changes.
- Do **not** break existing frontend API contracts (no frontend files change).
- Role-based authorization behavior unchanged.
- State assumptions explicitly.

## 2. Decisions (locked)

| Decision | Choice | Reason |
|---|---|---|
| ORM | Prisma | Requested; first-class TS types, migrations, good Postgres support |
| File storage | Cloudinary | Simplest: one SDK for image + raw files, free tier, no bucket/IAM setup |
| Existing data | Start fresh + reseed | No critical prod data; old disk uploads already ephemeral |
| Backend language | TypeScript (strict) | Matches global standard; Prisma is TS-native |
| File delivery | Proxy/stream through backend | Preserves current JWT-protected behavior; files not public |

## 3. Assumptions (explicit)

1. No production data to preserve — fresh schema + seed. Old Render-disk uploads are already lost.
2. API response shapes stay byte-compatible with what the frontend reads: every entity exposes
   **`_id`** (string), arrays stay arrays (`spocs`, `tags`, `versions`), and Mongoose `populate`
   shapes are reproduced. No frontend file changes.
3. Validation messages/status codes stay identical (current manual checks, just typed) — no error drift.
4. `projectAmount` → SQL `Float` (Mongo Double; preserves `number` JSON output, avoids Prisma
   `Decimal` string serialization changing the contract).
5. `projectStatus` → SQL `String` (not a DB enum): values contain spaces (`"In Progress"`,
   `"On Hold"`), invalid as enum identifiers; allowed set validated in app, exactly as today.
6. `email` is lowercased in the service layer on write (Mongoose did this via `lowercase: true`);
   login lookup uses the raw provided email, matching current behavior.

## 4. Target structure (TypeScript + thin service layer)

```
backend/server/
  prisma/
    schema.prisma          # models + migrations source of truth
    seed.ts                # Postgres-compatible seed (3 users + 10 projects)
  src/
    server.ts
    lib/db.ts              # PrismaClient singleton
    lib/cloudinary.ts      # SDK config
    lib/storage.ts         # upload / delete / stream abstraction (Cloudinary)
    middleware/auth.ts     # protect + authorize (typed req.user)
    services/{user,project,document}.service.ts   # all Prisma data access
    routes/{auth,projects,documents}.ts           # controllers (contracts unchanged)
    utils/serialize.ts     # id→_id aliasing + populate-shape helpers
    types/express.d.ts     # Request augmentation (req.user)
  tsconfig.json            # strict
  package.json             # new deps + build/migrate/seed scripts
  tests/                   # Jest + supertest
  render.yaml              # Blueprint: web service + managed Postgres
  .env.example             # documented env vars
```

## 5. Prisma schema

```prisma
model User {
  id        String   @id @default(cuid())   // serialized as _id
  name      String
  email     String   @unique                // app lowercases on write
  password  String
  role      Role     @default(viewer)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
enum Role { admin manager viewer }

model Project {
  id            String   @id @default(cuid())
  projectName   String
  spocs         String[]
  scopeDoc      String
  projectNumber String   @unique
  projectAmount Float
  projectStatus String   @default("Planning")
  projectManager String
  description   String   @default("")
  startDate     DateTime
  endDate       DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  documents     Document[]
  @@index([projectStatus])
  @@index([projectManager])
  @@index([createdAt])
}

model Document {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  fileName      String
  originalName  String
  filePath      String                       // Cloudinary secure_url
  fileType      String
  fileSize      Int
  uploadedBy    String
  uploadedAt    DateTime @default(now())
  description   String   @default("")
  tags          String[] @default([])
  versionNote   String   @default("")
  storagePublicId     String?                // Cloudinary public_id
  storageResourceType String?                // 'image' | 'raw'
  versions      DocumentVersion[]
  @@index([projectId])
  @@index([uploadedAt])
}

model DocumentVersion {
  id            String   @id @default(cuid())
  documentId    String
  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  fileName      String
  filePath      String
  fileSize      Int
  fileType      String
  uploadedBy    String
  uploadedAt    DateTime @default(now())
  versionNote   String   @default("")
  storagePublicId     String?
  storageResourceType String?
}
```

## 6. Field mapping (Mongoose → Postgres)

| Model | Mongoose | Postgres / Prisma | Notes |
|---|---|---|---|
| User | `_id: ObjectId` | `id String @id @default(cuid())` | serialized back as `_id` |
| | `email unique lowercase` | `String @unique` | lowercased in service |
| | `role enum default viewer` | `Role` DB enum | identifiers valid |
| | `timestamps` | `createdAt/updatedAt` | |
| Project | `spocs: [String]` | `String[]` (text[]) | array search/distinct via raw SQL |
| | `projectNumber unique` | `String @unique` | |
| | `projectAmount Number min 0` | `Float` | `>=0` validated in app |
| | `projectStatus enum` | `String` | spaces in values → not a DB enum |
| | `description trim` | `String @default("")` | |
| | `startDate/endDate Date` | `DateTime` | |
| | `timestamps` | `createdAt/updatedAt` | |
| Document | `projectId: ObjectId ref` | `projectId String` + FK relation | `onDelete: Cascade` |
| | `versions: [VersionSchema]` | `DocumentVersion[]` table | reconstructed as `versions[]` in JSON |
| | `tags: [String]` | `String[]` | |
| | `uploadedAt default now` | `DateTime @default(now())` | |
| | (disk path) | `filePath`=secure_url + `storagePublicId`/`storageResourceType` | new internal cols |

## 7. Mongo-specific logic → SQL/Prisma replacements

| Current (Mongo) | Replacement |
|---|---|
| `$regex,$options:'i'` on scalar fields | Prisma `{ contains, mode:'insensitive' }` |
| `$regex` on `spocs` array (the `$or` search) | raw `EXISTS (SELECT 1 FROM unnest(spocs) s WHERE s ILIKE '%'||$1||'%')` |
| `spocs = spoc` exact filter | Prisma `{ spocs: { has: spoc } }` |
| `distinct('scopeDoc'/'manager'/'name')` | Prisma `findMany({ distinct })` |
| `distinct('spocs')` (array) | raw `SELECT DISTINCT unnest(spocs)` |
| per-project `countDocuments` loop (N+1) | single `include:{ _count:{ select:{ documents:true }}}` → `fileCount` |
| `aggregate $group/$sum` (totals, by status, by manager) | `aggregate({_sum})` + `groupBy(['projectStatus'/'projectManager'])` |
| monthly trends `$year/$month` | raw `date_trunc('month', "startDate")` group |
| `populate('projectId', …)` | Prisma `select` on relation → shaped `{ _id, projectName, spocs[, projectNumber] }` |
| embedded `versions.push` on replace | `documentVersion.create` inside `$transaction` |
| `deleteMany`/`findByIdAndDelete` + `fs.unlink` | delete Cloudinary assets, then `delete`; FK cascade cleans versions |

The **projects list** endpoint (array search + scalar search + filters + sort + pagination + counts)
becomes one parameterized `$queryRaw` (+ count query) — the one place Prisma's builder can't express
the array substring search. Everything else uses the Prisma builder.

### Response-shape contract notes
- All entities serialize `id` → `_id` (string); drop `id`/`__v`.
- Project list: each item adds `fileCount`; envelope keeps `{ projects, pagination, filters }` exactly.
- Project detail: `{ ...project, documents: [...] }`.
- `/stats`: keep every existing key (`totalProjects`, `totalSpocs`, `totalCompanies`, `totalValue`,
  `activeValue`, `completedValue`, `pendingValue`, `activeCount`, `completedCount`, `pendingCount`,
  `statusCounts` map, `managerCounts[]`, `monthlyTrends[]`, `recentProjects[]`).
- Documents: `versions` reconstructed as an ordered array; `projectId` shaped as a nested object on the
  endpoints that currently `populate` it (list, recent, single GET, PUT, replace), left as a string where
  the current code does not populate (POST upload response).

## 8. File storage (Cloudinary, proxy delivery)

- `multer` → memory storage; buffer → `cloudinary.uploader.upload_stream({ resource_type: 'auto' })`.
  Persist `secure_url` (filePath), `public_id`, `resource_type`, `bytes` (fileSize), `fileType` (ext).
- `/documents/download/:id` & `/preview/:id`: keep JWT auth; stream bytes server-side from Cloudinary
  (files not directly exposed). Frontend unchanged.
- Delete handlers: `cloudinary.uploader.destroy(public_id, { resource_type })` for the doc + each
  version before deleting rows.
- Tests mock the Cloudinary SDK (no network).

## 9. Environment variables

Documented in `.env.example`.
- New/changed: `DATABASE_URL` (Render Postgres), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`.
- Kept: `JWT_SECRET`, `PORT`, `NODE_ENV`, `SEED_DATABASE`, `FRONTEND_URL`.
- Removed: `MONGO_URI`, `UPLOAD_DIR`.
- Tests: `TEST_DATABASE_URL`.

## 10. Render deployment

- Managed PostgreSQL instance → Internal `DATABASE_URL` wired to the service.
- Web service (root `backend/server`):
  - Build: `npm install && npx prisma generate && npm run build`
  - Pre-Deploy: `npx prisma migrate deploy`
  - Start: `node dist/server.js`
  - Health check path: `/health`
  - First-run seed via `SEED_DATABASE=true` (or one-off job).
- Captured as `render.yaml` (Blueprint).

## 11. Tests (Jest + ts-jest + supertest)

- Auth: login success/failure, `protect` 401, `authorize` 403, admin self-delete guard.
- Projects: create (incl. duplicate projectNumber 400), list filters/search/pagination, update, delete cascade.
- Stats: totals/by-status/by-manager/monthly aggregation correctness.
- Documents: upload metadata, update metadata, replace + version history growth, delete cleanup.
- Cloudinary mocked; tests run against disposable Postgres via `TEST_DATABASE_URL`
  (migrate + truncate-between-tests).

## 12. Migration steps (to execute)

1. Add deps (`@prisma/client`, `prisma`, `cloudinary`, `multer`, TS toolchain, Jest/supertest); remove `mongoose`, `mongodb-memory-server`, `bcryptjs` stays.
2. `prisma init`; author `schema.prisma`.
3. `prisma migrate dev --name init`; `prisma generate`.
4. Implement lib/services/routes in TS; serializers; storage abstraction.
5. Port seed to `prisma/seed.ts`; wire `prisma db seed`.
6. Add tests; run green.
7. Add `render.yaml`, `.env.example`, update README.

## 13. Rollback plan

- Mongoose implementation preserved on a branch/tag before changes.
- Revert = redeploy prior commit + restore `MONGO_URI` env.
- Prisma migrations are versioned; fresh-start means no data-loss risk on rollback.

## 14. Out of scope (YAGNI)

- ETL of existing Mongo data (chosen: fresh start).
- Frontend changes.
- Signed-URL/private Cloudinary delivery (proxy streaming chosen).
- Refresh tokens / auth redesign (behavior preserved as-is).
