
import "dotenv/config";

console.log("TEST SCRIPT STARTED");

console.log("Portal URL configured:", Boolean(process.env.PORTAL_BASE_URL));
console.log("Portal email configured:", Boolean(process.env.PORTAL_EMAIL));
console.log("Portal password configured:", Boolean(process.env.PORTAL_PASSWORD));

try {
  console.log("Importing portal client...");

  const { loginToPortal, getMeterEnergy } =
    await import("../src/portal-client.js");

  console.log("Portal client imported.");
  console.log("Attempting login...");

  await loginToPortal();

  console.log("Login successful!");
  console.log("Requesting energy data...");

  const result = await getMeterEnergy("J100000");

  console.log("Energy data received:");
  console.log(JSON.stringify(result, null, 2).slice(0, 2000));
} catch (error) {
  console.error("ERROR:", error);
  process.exitCode = 1;
}
