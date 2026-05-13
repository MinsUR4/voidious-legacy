import http from "node:http";
import path from "node:path";
import { createBareServer } from "@tomphttp/bare-server-node";
import chalk from "chalk";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import mime from "mime";
import fetch from "node-fetch";

import { setupMasqr } from "./Masqr.js";
import config from "./config.js";

console.log(chalk.yellow("🚀 Starting server..."));

const __dirname = process.cwd();

const app = express();
const server = http.createServer();

const bareServer = createBareServer("/ov/");

const PORT = process.env.PORT || 8080;

const cache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

// ======================
// PASSWORD PROTECTION
// ======================

if (config.challenge) {
  console.log(
    chalk.green("🔒 Password protection is enabled! Listing logins below"),
  );

  Object.entries(config.users).forEach(([username, password]) => {
    console.log(chalk.blue(`Username: ${username}, Password: ${password}`));
  });

  app.use(
    basicAuth({
      users: config.users,
      challenge: true,
    }),
  );
}

// ======================
// MIDDLEWARE
// ======================

app.use(cookieParser());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use(
  "/ov",
  cors({
    origin: true,
  }),
);

// ======================
// MASQR
// ======================

if (process.env.MASQR === "true") {
  setupMasqr(app);
}

// ======================
// ASSET PROXY
// ======================

app.get("/e/*", async (req, res, next) => {
  try {
    if (cache.has(req.path)) {
      const { data, contentType, timestamp } = cache.get(req.path);

      if (Date.now() - timestamp <= CACHE_TTL) {
        res.writeHead(200, {
          "Content-Type": contentType,
        });

        return res.end(data);
      }

      cache.delete(req.path);
    }

    const baseUrls = {
      "/e/1/": "https://raw.githubusercontent.com/v-5x/x/fixy/",
      "/e/2/": "https://raw.githubusercontent.com/ypxa/y/main/",
      "/e/3/": "https://raw.githubusercontent.com/ypxa/w/master/",
    };

    let reqTarget = null;

    for (const [prefix, baseUrl] of Object.entries(baseUrls)) {
      if (req.path.startsWith(prefix)) {
        reqTarget = baseUrl + req.path.slice(prefix.length);
        break;
      }
    }

    if (!reqTarget) {
      return next();
    }

    const asset = await fetch(reqTarget);

    if (!asset.ok) {
      return next();
    }

    const data = Buffer.from(await asset.arrayBuffer());

    const ext = path.extname(reqTarget);

    const noMime = [".unityweb"];

    const contentType = noMime.includes(ext)
      ? "application/octet-stream"
      : mime.getType(ext) || "application/octet-stream";

    cache.set(req.path, {
      data,
      contentType,
      timestamp: Date.now(),
    });

    res.writeHead(200, {
      "Content-Type": contentType,
    });

    res.end(data);
  } catch (error) {
    console.error("Error fetching asset:", error);

    res.status(500).send("Error fetching the asset");
  }
});

// ======================
// STATIC FILES
// ======================

app.use(express.static(path.join(__dirname, "static")));

// ======================
// ROUTES
// ======================

const routes = [
  { path: "/as", file: "apps.html" },
  { path: "/gm", file: "games.html" },
  { path: "/st", file: "settings.html" },
  { path: "/ta", file: "tabs.html" },
  { path: "/ts", file: "tools.html" },
  { path: "/", file: "index.html" },
  { path: "/tos", file: "tos.html" },
  { path: "/privacy", file: "privacy.html" },
];

routes.forEach((route) => {
  app.get(route.path, (_req, res) => {
    res.sendFile(path.join(__dirname, "static", route.file));
  });
});

// ======================
// 404 HANDLER
// ======================

app.use((req, res) => {
  res
    .status(404)
    .sendFile(path.join(__dirname, "static", "404.html"));
});

// ======================
// ERROR HANDLER
// ======================

app.use((err, req, res, next) => {
  console.error(err.stack);

  res
    .status(500)
    .sendFile(path.join(__dirname, "static", "404.html"));
});

// ======================
// SERVER EVENTS
// ======================

server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

server.on("listening", () => {
  console.log(
    chalk.green(`🌍 Server is running on http://localhost:${PORT}`),
  );
});

// ======================
// START SERVER
// ======================

server.listen(PORT);
