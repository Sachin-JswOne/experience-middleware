<p align="center">
  <img src="https://nodejs.org/static/images/logo.svg" width="60" alt="Node.js Logo" />
  <img src="https://nestjs.com/img/logo-small.svg" width="60" alt="NestJS Logo" />
  <img src="https://raw.githubusercontent.com/remojansen/logo.ts/master/ts.png" width="60" alt="TypeScript Logo" />
</p>

<h1 align="center">JSWONE Experience Middleware</h1>

<p align="center">
  <b>A robust, extensible Backend-for-Frontend (BFF) and API Gateway layer for JSWONE, built with Node.js, NestJS, and TypeScript.</b>
</p>

<p align="center">
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="https://nestjs.com/" target="_blank"><img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" alt="NestJS" /></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

# Experience Middleware

## About This Project

**Experience Middleware** is a Node.js/NestJS-based Backend-for-Frontend (BFF) and API Gateway layer designed to aggregate, transform, and proxy requests between frontend clients and multiple backend services (such as CMS and retail APIs). It enables seamless orchestration of data from various microservices, applying custom transformations and aggregations to deliver optimized, frontend-ready responses.

### Key Capabilities

- **API Proxying:** Forwards requests from the frontend to backend services, handling authentication, headers, and error management.
- **Data Aggregation:** Combines responses from multiple backend APIs into a single, unified response (e.g., home page data from CMS, top products, and buy-again recommendations).
- **Custom Transformations:** Applies request and response transformations (via pluggable transformers) to shape data as needed by the frontend.
- **Config-Driven Routing:** Uses a JSON-based route configuration to define which endpoints are proxied, aggregated, or transformed, and how.
- **Extensible:** Easily add new routes, targets, and transformation logic without changing core code.

### Example Use Cases

- Aggregating home page data from a CMS and product APIs into a single response for the frontend.
- Transforming request payloads or response formats to match frontend requirements.
- Acting as a secure gateway between frontend apps and internal/external APIs.

## How It Works

- All routes are prefixed with `/xp-mi` (e.g., `/xp-mi/public/app-home-page`).
- Route behavior (proxy, transform, aggregate) is defined in `src/assets/dev/route-config.json` (or the appropriate environment folder).
- Each route specifies its handler type (`TRANSFORM`, `AGGREGATE`), target APIs, and optional transformation functions.
- Aggregated responses can be merged and shaped using custom logic (see `src/transformations/`).

### Example Route Config

```json
{
  "path": "/xp-mi/public/v1/app-home-page",
  "method": "POST",
  "routeHandler": "AGGREGATE",
  "aggregationType": "PARALLEL",
  "targets": [
    { "name": "app-home-page", "url": "https://cms-msme-ext.qa.jswone.in/api/app-home-page", ... },
    { "name": "app-top-items", "url": "https://jswoneconstruct.in/jswretail/v3/seller/top-product", ... },
    { "name": "app-buy-again", "url": "https://jswoneconstruct.in/jswretail/v1/seller/buy-again", ... }
  ],
  "resTransform": "app.transformers.mergeHomePageResponses"
}
```

## How to Use

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Configure routes:**
   - Edit `src/assets/dev/route-config.json` to define which endpoints to proxy/aggregate and how.
3. **Run the server:**
   ```bash
   pnpm run start:dev
   ```
   The server will start on the port defined in your environment (default: 3000).
4. **Send requests:**
   - Example: `POST /xp-mi/public/v1/app-home-page` will aggregate and return home page data from multiple sources.

---

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

_Deployment instructions placeholder_

---

## Support

JSWONE Experience Middleware is maintained by CCP Team.

## Contact For Support

- Name: Sachin Sharma
- Email: sachin.sharma@jsw.in
