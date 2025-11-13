# Origami Portal – Read-Only Dashboard Edition

**Purpose:**  Provide a secure, read-only dashboard that surfaces Origami CRM entities, metrics, and aggregations while preparing the codebase for future record-editing workflows.

**Stack:**  Vite + React (TypeScript), Zustand, Tailwind CSS, Recharts, and Framer Motion on the frontend with an Express (Node.js) backend proxy layer that talks to the Origami API.

**Key Features:**  Cached structure/data retrieval from Origami, file-backed user management with bcrypt-hashed credentials, JWT-based sessions, configurable drag-and-resize widgets persisted to LocalStorage, and admin utilities for refreshing data and managing users.

**Bootstrap Admin:**  On startup the server hashes the ADMIN_USERNAME and ADMIN_PASSWORD from the `.env` file and seeds them into `server/data/users.json` if the user does not already exist.

**Environment Configuration:**  Set `ORIGAMI_ENVIRONMENT` in `server/.env` to the Origami environment name. The server will construct `https://<env>.origami.ms/entities/api` automatically to align with the Origami API documentation.
