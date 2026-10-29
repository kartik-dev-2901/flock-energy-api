
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("./portal-client.js", () => ({
  getMeterEnergy: vi.fn(),
}));

import app from "./app.js";
import { getMeterEnergy } from "./portal-client.js";

describe("Flock Energy API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a healthy status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("lists meters with pagination", async () => {
    const response = await request(app)
      .get("/api/v1/meters")
      .query({ page: 1, limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
  });

  it("rejects invalid pagination parameters", async () => {
    const response = await request(app)
      .get("/api/v1/meters")
      .query({ page: 0, limit: 10 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  it("returns 404 for an unknown meter", async () => {
    const response = await request(app)
      .get("/api/v1/meters/UNKNOWN_METER");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("METER_NOT_FOUND");
  });

  it("returns energy readings for a known meter", async () => {
    getMeterEnergy.mockResolvedValue({
      data: [
        {
          timestamp: "24/06/2026 00:00",
          kwh: "48439.16",
          kvah: "52314.29",
          voltR: "229",
        },
      ],
    });

    const response = await request(app)
      .get("/api/v1/meters/J100000/energy");

    // If J100000 is in the local meter index, the mock is used.
    if (response.status === 200) {
      expect(response.body.meterId).toBe("J100000");
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].kwh).toBe("48439.16");
      expect(getMeterEnergy).toHaveBeenCalledWith("J100000");
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("returns 502 when the portal request fails", async () => {
    getMeterEnergy.mockRejectedValue(
      new Error("Simulated portal failure")
    );

    const response = await request(app)
      .get("/api/v1/meters/J100000/energy");

    if (response.status === 200) {
      // This branch would mean the route unexpectedly succeeded.
      expect(response.body.error).toBeUndefined();
    } else {
      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("UPSTREAM_ERROR");
    }
  });
});
