import "dotenv/config";
import app from "./app";
import connectDB from "./config/db";

const PORT = Number(process.env.PORT ?? 5000);

(async () => {
  await connectDB();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[SERVER] Team 3 backend running at http://127.0.0.1:${PORT}`);
  });
})();
