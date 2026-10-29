
import express from "express";
import { z } from "zod";
import {
  listMeters,
  getMeterById,
} from "./meter.service.js";
import { getMeterEnergy } from "./portal-client.js";

const app = express();

app.use(express.json());

// -------------------- Health check --------------------

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    service: "flock-energy-api",
  });
});

// -------------------- Meter listing and search --------------------

const QuerySchema = z.object({
  q: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

app.get("/api/v1/meters", (req, res) => {
  const result = QuerySchema.safeParse(req.query);

  if (!result.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_QUERY",
        message: "Invalid query parameters.",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const { q, page, limit } = result.data;

  return res.status(200).json(
    listMeters({ q, page, limit })
  );
});

// -------------------- Meter details --------------------

const MeterIdSchema = z.string().trim().min(1).max(100);

app.get("/api/v1/meters/:meterId", (req, res) => {
  const parsedId = MeterIdSchema.safeParse(req.params.meterId);

  if (!parsedId.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_METER_ID",
        message: "A valid meter ID is required.",
      },
    });
  }

  const meterId = parsedId.data;
  const meter = getMeterById(meterId);

  if (!meter) {
    return res.status(404).json({
      error: {
        code: "METER_NOT_FOUND",
        message: "Meter not found.",
      },
      meterId,
    });
  }

  return res.status(200).json({
    data: meter,
  });
});

// -------------------- Meter energy readings --------------------

// The portal currently returns these measurement values as strings.
const EnergyReadingSchema = z.object({
  timestamp: z.string(),
  kwh: z.string(),
  kvah: z.string(),
  voltR: z.string(),
});

const EnergyResponseSchema = z.object({
  data: z.array(EnergyReadingSchema),
});

app.get("/api/v1/meters/:meterId/energy", async (req, res) => {
  const parsedId = MeterIdSchema.safeParse(req.params.meterId);

  if (!parsedId.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_METER_ID",
        message: "A valid meter ID is required.",
      },
    });
  }

  const meterId = parsedId.data;

  // Check the local meter index before making an upstream request.
  const meter = getMeterById(meterId);

  if (!meter) {
    return res.status(404).json({
      error: {
        code: "METER_NOT_FOUND",
        message: "Meter not found.",
      },
      meterId,
    });
  }

  try {
    const result = await getMeterEnergy(meterId);

    const parsedResponse = EnergyResponseSchema.safeParse(result);

    if (!parsedResponse.success) {
      console.error(
        "Unexpected energy response structure from portal."
      );

      return res.status(502).json({
        error: {
          code: "INVALID_UPSTREAM_RESPONSE",
          message: "The meter portal returned an unexpected response.",
        },
      });
    }

    const readings = parsedResponse.data.data;

    return res.status(200).json({
      meterId,
      count: readings.length,
      data: readings,
    });
  } catch (error) {
    // Log the technical message on the server, not to API consumers.
    console.error("Energy route failed:", error.message);

    return res.status(502).json({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Unable to retrieve energy readings from the meter portal.",
      },
    });
  }
});

export default app;
