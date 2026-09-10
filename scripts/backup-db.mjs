// WAL-safe копия app.db: один app.db без -wal/-shm — это обрезанный образ
// (отсюда "database disk image is malformed" при открытии скачанного файла).
// Скрипт делает CHECKPOINT (сливает WAL в основной файл) и только потом копирует.
//
// Использование:
//   pnpm db:backup [куда/app.db]   — по умолчанию ./data/app.db.backup-<дата>
//   DATA_DIR=/data pnpm db:backup /tmp/app.db   — бэкап продовой БД
// На сервере (docker): docker cp <container>:/tmp/app.db ./app.db
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function resolveDbPath() {
  const direct = process.env.SQLITE_PATH;
  if (direct) return direct;
  const dir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
  return join(dir, 'app.db');
}

const src = resolveDbPath();
if (!existsSync(src)) {
  console.error(`БД не найдена: ${src}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = resolve(
  process.argv[2] ?? join(dirname(src), `app.db.backup-${stamp}`)
);

const db = new DatabaseSync(src);
try {
  db.exec('PRAGMA busy_timeout = 10000;');
  // TRUNCATE: слить WAL в app.db и обнулить журнал — после этого
  // одиночный файл самодостаточен и открывается где угодно.
  const row = db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get();
  if (row?.busy) {
    console.error(
      'CHECKPOINT не удался (БД занята), копия может быть неполной'
    );
    process.exit(1);
  }
} finally {
  db.close();
}
copyFileSync(src, dest);
console.log(`OK: ${src} -> ${dest}`);
