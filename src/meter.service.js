
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(
  currentDir,
  "../data/meter-export.json"
);

const MeterSchema = z.object({
  meterId: z.string(),
  serialNo: z.string(),
  make: z.string(),
  phaseType: z.string(),
  installStatus: z.string(),
  installType: z.string(),
  build: z.string(),
  dtCode: z.string(),
  hierarchy: z.object({
    zone: z.object({ name: z.string(), code: z.string() }),
    circle: z.object({ name: z.string(), code: z.string() }),
    division: z.object({ name: z.string(), code: z.string() }),
    subdivision: z.object({ name: z.string(), code: z.string() }),
    substation: z.object({ name: z.string(), code: z.string() }),
    feeder: z.object({ name: z.string(), code: z.string() }),
    dt: z.object({ name: z.string(), code: z.string() }),
  }),
  geo: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
});

const ExportSchema = z.object({
  data: z.array(MeterSchema),
  total: z.number(),
});

const exportData = JSON.parse(await readFile(dataPath, "utf8"));

let meters;

if (Array.isArray(exportData)) {
  // The downloaded file is a plain array of meter records.
  meters = z.array(MeterSchema).parse(exportData);
} else {
  // The file is an object containing data and total.
  const parsedExport = ExportSchema.parse(exportData);
  meters = parsedExport.data;

  if (meters.length !== parsedExport.total) {
    throw new Error(
      `Export count mismatch: expected ${parsedExport.total}, loaded ${meters.length}`
    );
  }
}

console.log(`Loaded ${meters.length} meters`);

export function listMeters({ q = "", page = 1, limit = 20 } = {}) {
  const query = q.trim().toLowerCase();

  const filtered = query
    ? meters.filter((meter) =>
        [
          meter.meterId,
          meter.serialNo,
          meter.make,
          meter.dtCode,
          meter.installStatus,
        ].some((value) => value.toLowerCase().includes(query))
      )
    : meters;

  const total = filtered.length;
  const start = (page - 1) * limit;

  return {
    data: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function getMeterById(meterId) {
  return meters.find(
    (meter) => meter.meterId.toLowerCase() === meterId.toLowerCase()
  ) ?? null;
}
