// Recruitment tracker: one-shot XLSX export.
//
//   Summary tab + one tab per district (8 districts).
//   Each district tab lists every (AC, Mandal) pair plus empty tracking columns
//   the recruitment team fills in by hand:
//     Contributor Name | Phone | Status | Group | Group Added | Notes
//
// Re-run after any AC/mandal/district change - the file is overwritten and
// any in-progress edits in the file should be merged before that.
//
// Run from packages/db:
//     bunx tsx scripts/export-recruitment-xlsx.ts
//
// Output:
//     <repo-root>/rayalaseema-recruitment.xlsx

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import * as path from "path";

const prisma = new PrismaClient();

// Status pick-list for the dropdown column. Keep short - long lists make the
// dropdown unwieldy in Excel.
const STATUS_OPTIONS = ["Searching", "Contacted", "Confirmed", "Onboarded", "Declined"];

const BRAND_RED = "FFE01B1B";
const HEADER_BG = "FF1F2937";
const ALT_ROW = "FFF8F9FA";

interface MandalRow {
  acNumber: number;
  acTe: string;
  acEn: string;
  mandalTe: string;
  mandalEn: string;
  mandalCode: number | null;
}

interface DistrictBundle {
  slug: string;
  nameTe: string;
  nameEn: string;
  rows: MandalRow[];
}

async function gather(): Promise<DistrictBundle[]> {
  const districts = await prisma.district.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      constituencies: {
        where: { acNumber: { not: null } },
        orderBy: { acNumber: "asc" },
        include: {
          mandals: { orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] },
        },
      },
    },
  });

  return districts.map((d) => {
    const rows: MandalRow[] = [];
    for (const ac of d.constituencies) {
      if (ac.mandals.length === 0) {
        // Still list the AC even if no mandals seeded - recruitment can flag it.
        rows.push({
          acNumber: ac.acNumber!,
          acTe: ac.name,
          acEn: ac.nameEn,
          mandalTe: "(no mandals yet)",
          mandalEn: "",
          mandalCode: null,
        });
        continue;
      }
      for (const m of ac.mandals) {
        rows.push({
          acNumber: ac.acNumber!,
          acTe: ac.name,
          acEn: ac.nameEn,
          mandalTe: m.name,
          mandalEn: m.nameEn,
          mandalCode: m.code,
        });
      }
    }
    return { slug: d.slug, nameTe: d.name, nameEn: d.nameEn, rows };
  });
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 22;
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Noto Sans Telugu", size: 11 };
  row.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF374151" } },
      bottom: { style: "thin", color: { argb: "FF374151" } },
      left: { style: "thin", color: { argb: "FF374151" } },
      right: { style: "thin", color: { argb: "FF374151" } },
    };
  });
}

function applyZebraAndBorders(ws: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    row.font = { name: "Noto Sans Telugu", size: 11 };
    row.alignment = { vertical: "middle", wrapText: true };
    if (r % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW } };
      });
    }
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "hair", color: { argb: "FFE5E7EB" } },
        bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
        left: { style: "hair", color: { argb: "FFE5E7EB" } },
        right: { style: "hair", color: { argb: "FFE5E7EB" } },
      };
    });
  }
}

function buildSummary(wb: ExcelJS.Workbook, districts: DistrictBundle[]) {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: BRAND_RED } } });

  // Brand banner
  ws.mergeCells("A1:G1");
  const banner = ws.getCell("A1");
  banner.value = "రాయలసీమ ఎక్స్‌ప్రెస్ - Contributor Recruitment Tracker";
  banner.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Noto Serif Telugu", size: 16 };
  banner.alignment = { vertical: "middle", horizontal: "center" };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RED } };
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:G2");
  const sub = ws.getCell("A2");
  sub.value = `Generated ${new Date().toISOString().slice(0, 10)} · Edit per-district tabs below · "Onboarded" rolls up into this view`;
  sub.alignment = { horizontal: "center" };
  sub.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  ws.getRow(2).height = 18;

  // Header row at row 4
  const header = ws.addRow([]); // row 3 spacer
  header.height = 4;
  const head = ws.addRow([
    "#", "District (Telugu)", "District (English)", "Total ACs", "Total Mandals", "Onboarded", "Coverage %",
  ]);
  styleHeader(head);

  let totalAcs = 0, totalMandals = 0;
  districts.forEach((d, i) => {
    const acSet = new Set(d.rows.map((r) => r.acNumber));
    const mandalCount = d.rows.filter((r) => r.mandalEn !== "").length;
    totalAcs += acSet.size;
    totalMandals += mandalCount;

    const rowIndex = ws.rowCount + 1; // row number for formulas
    const districtSheetName = `${d.nameEn}`;
    // "Onboarded" - count rows on the district tab where Status column = "Onboarded".
    // Status column is column I on every district tab (see addDistrictSheet column order).
    const onboardedFormula = `COUNTIF('${districtSheetName}'!I:I,"Onboarded")`;
    const coverageFormula = `IF(E${rowIndex}=0,0,F${rowIndex}/E${rowIndex})`;

    const r = ws.addRow([
      i + 1,
      d.nameTe,
      d.nameEn,
      acSet.size,
      mandalCount,
      { formula: onboardedFormula } as any,
      { formula: coverageFormula } as any,
    ]);
    r.getCell(7).numFmt = "0.0%";
  });

  // Totals
  const totalRow = ws.addRow([
    "", "TOTAL", "",
    { formula: `SUM(D5:D${ws.rowCount})` } as any,
    { formula: `SUM(E5:E${ws.rowCount})` } as any,
    { formula: `SUM(F5:F${ws.rowCount})` } as any,
    { formula: `IF(E${ws.rowCount + 1}=0,0,F${ws.rowCount + 1}/E${ws.rowCount + 1})` } as any,
  ]);
  totalRow.font = { bold: true, size: 11 };
  totalRow.getCell(7).numFmt = "0.0%";
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
    cell.border = { top: { style: "thin", color: { argb: "FF111827" } } };
  });

  ws.columns = [
    { width: 5 },
    { width: 22 },
    { width: 22 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  ws.views = [{ state: "frozen", ySplit: 4 }];
}

function addDistrictSheet(wb: ExcelJS.Workbook, d: DistrictBundle) {
  const ws = wb.addWorksheet(d.nameEn, { properties: { tabColor: { argb: BRAND_RED } } });

  // Banner
  ws.mergeCells("A1:L1");
  const banner = ws.getCell("A1");
  banner.value = `${d.nameTe} (${d.nameEn}) - ${d.rows.length} mandal rows`;
  banner.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Noto Serif Telugu", size: 14 };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RED } };
  ws.getRow(1).height = 28;

  // Column header at row 3 (row 2 is spacer)
  const headers = [
    "AC #", "AC (Telugu)", "AC (English)",
    "Mandal (Telugu)", "Mandal (English)", "Mandal Code",
    "Contributor Name", "Phone", "Status", "Group Name", "Group Added", "Notes",
  ];
  const head = ws.addRow([]); // row 2 spacer
  head.height = 4;
  styleHeader(ws.addRow(headers));  // row 3

  const dataStart = ws.rowCount + 1;
  for (const r of d.rows) {
    ws.addRow([
      r.acNumber, r.acTe, r.acEn,
      r.mandalTe, r.mandalEn, r.mandalCode ?? "",
      "", "", "", "", "", "",
    ]);
  }
  const dataEnd = ws.rowCount;

  applyZebraAndBorders(ws, dataStart, dataEnd);

  // Status dropdown (column I)
  ws.dataValidations.add(`I${dataStart}:I${dataEnd}`, {
    type: "list",
    allowBlank: true,
    formulae: [`"${STATUS_OPTIONS.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Invalid status",
    error: `Pick one of: ${STATUS_OPTIONS.join(", ")}`,
  });

  // Group Added dropdown (column K) - Yes / No
  ws.dataValidations.add(`K${dataStart}:K${dataEnd}`, {
    type: "list",
    allowBlank: true,
    formulae: [`"Yes,No"`],
  });

  ws.columns = [
    { width: 6 },   // AC #
    { width: 18 },  // AC TE
    { width: 18 },  // AC EN
    { width: 22 },  // Mandal TE
    { width: 20 },  // Mandal EN
    { width: 10 },  // Mandal Code
    { width: 22 },  // Contributor
    { width: 16 },  // Phone
    { width: 13 },  // Status
    { width: 22 },  // Group
    { width: 12 },  // Group Added
    { width: 30 },  // Notes
  ];

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: dataEnd, column: headers.length } };
}

async function main() {
  console.log("Querying DB…");
  const districts = await gather();
  for (const d of districts) {
    console.log(`  ${d.nameEn.padEnd(16)} ${d.rows.length} mandal rows`);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Rayalaseema Express";
  wb.created = new Date();
  wb.title = "Contributor Recruitment Tracker";

  buildSummary(wb, districts);
  for (const d of districts) addDistrictSheet(wb, d);

  const outPath = path.resolve(__dirname, "../../../rayalaseema-recruitment.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log(`\nWrote: ${outPath}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
