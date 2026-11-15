/**
 * Normalizes province spellings already stored in the database.
 *
 *  a. Merges ProvinceConfig rows whose names differ only by case/accents
 *     ("DISTRITO NACIONAL" + "Distrito Nacional"): the mixed-case row (oldest on
 *     ties) is kept, the others become its variants and are deleted; the kept
 *     row is active when any of them was.
 *  b. Seeds variants from the static alias table (lib/zone-map.ts) only when the
 *     alias target is a configured province and the alias is not another
 *     configured province's name or variant. Distinct provinces are never
 *     merged here; that is done from Configuración > Provincias.
 *  c. Rewrites every province reference column (lib/province-references.ts)
 *     whose value resolves to a different canonical spelling. Rows with a zone
 *     column (Card.zona, Customer.zona) take the configured zone when their
 *     province is rewritten.
 *
 * Dry-run by default. Pass --apply to write, all in one transaction.
 * Idempotent: a second run reports zero changes.
 *
 *   npx tsx scripts/normalize-provinces.ts
 *   npx tsx scripts/normalize-provinces.ts --apply
 */
import { prisma } from "../lib/prisma";
import { planProvinceNormalization } from "../lib/province-normalize-plan";
import {
  countReferenceRows,
  countZoneChanges,
  findReferenceValues,
  PROVINCE_REFERENCES,
  rewriteReferenceValues,
} from "../lib/province-references";

const apply = process.argv.includes("--apply");
const SAMPLE = 15;

function groupByTarget(rewrites: Array<{ from: string; to: { nombre: string; zona: string } }>) {
  const groups = new Map<string, { to: { nombre: string; zona: string }; from: string[] }>();
  for (const item of rewrites) {
    const group = groups.get(item.to.nombre) ?? { to: { nombre: item.to.nombre, zona: item.to.zona }, from: [] };
    group.from.push(item.from);
    groups.set(item.to.nombre, group);
  }
  return [...groups.values()];
}

async function main() {
  const configs = await prisma.provinceConfig.findMany({ orderBy: { createdAt: "asc" } });
  const referenceValues: Record<string, string[]> = {};
  for (const reference of PROVINCE_REFERENCES) {
    referenceValues[reference.label] = await findReferenceValues(prisma, reference);
  }

  const plan = planProvinceNormalization(configs, referenceValues);

  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`\n[a] Duplicate ProvinceConfig rows to merge: ${plan.merges.length}`);
  for (const merge of plan.merges) {
    console.log(`  keep "${merge.keep.nombre}" <- absorb ${merge.absorbed.map((row) => `"${row.nombre}"`).join(", ")} (active=${merge.active})`);
  }
  console.log(`\n[b] Provinces receiving static variants: ${plan.seeds.length}`);
  for (const seed of plan.seeds) {
    console.log(`  "${seed.config.nombre}" + ${seed.added.map((alias) => `"${alias}"`).join(", ")}`);
  }

  console.log(`\n[c] Reference rewrites`);
  for (const reference of PROVINCE_REFERENCES) {
    const rewrites = plan.rewrites[reference.label] ?? [];
    const groups = groupByTarget(rewrites);
    let rows = 0;
    let zoneRows = 0;
    for (const group of groups) {
      rows += await countReferenceRows(prisma, reference, group.from);
      zoneRows += await countZoneChanges(prisma, reference, group.from, group.to.zona);
    }
    const zoneNote = reference.zoneColumn ? `, zone changes ${zoneRows}` : "";
    console.log(`  ${reference.label}: ${rewrites.length} distinct values, ${rows} rows${zoneNote}`);
    for (const item of rewrites.slice(0, SAMPLE)) console.log(`    "${item.from}" -> "${item.to.nombre}"`);
    if (rewrites.length > SAMPLE) console.log(`    ... ${rewrites.length - SAMPLE} more`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write these changes.");
    return;
  }

  const applied = await prisma.$transaction(
    async (tx) => {
      for (const merge of plan.merges) {
        // Delete first so the kept row can take the absorbed names as variants.
        await tx.provinceConfig.deleteMany({ where: { id: { in: merge.absorbed.map((row) => row.id) } } });
        await tx.provinceConfig.update({ where: { id: merge.keep.id }, data: { aliases: merge.aliases, active: merge.active } });
      }
      for (const seed of plan.seeds) {
        // Reads the merged aliases from the final plan so a and b compose.
        const final = plan.finalConfigs.find((config) => config.id === seed.config.id)!;
        await tx.provinceConfig.update({ where: { id: seed.config.id }, data: { aliases: final.aliases } });
      }
      const result: Record<string, { rows: number; zoneRows: number }> = {};
      for (const reference of PROVINCE_REFERENCES) {
        let rows = 0;
        let zoneRows = 0;
        for (const group of groupByTarget(plan.rewrites[reference.label] ?? [])) {
          const outcome = await rewriteReferenceValues(tx, reference, group.from, group.to);
          rows += outcome.rows;
          zoneRows += outcome.zoneRows;
        }
        result[reference.label] = { rows, zoneRows };
      }
      return result;
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  console.log("\nApplied:");
  for (const [label, counts] of Object.entries(applied)) {
    console.log(`  ${label}: ${counts.rows} rows rewritten, ${counts.zoneRows} zone changes`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
