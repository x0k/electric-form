// Package mappings отдаёт встроенный в бинарь seed-маппинг запросов.
//
// Бинарь должен оставаться самодостаточным: в прод-образе рядом с ним нет
// файлов (раньше дефолт mappings/seed-mapping.json зависел от cwd и падал
// с "open mappings/seed-mapping.json: no such file or directory").
// Флаг --mapping по-прежнему позволяет подсунуть внешний файл.
package mappings

import _ "embed"

// Seed — содержимое mappings/seed-mapping.json, вшитое в бинарь.
//
//go:embed seed-mapping.json
var Seed []byte
