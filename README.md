[![CI](https://github.com/Philip44-0/mcrs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Philip44-0/mcrs/actions/workflows/ci.yml)

# MCRS – Modular Cash Register System

This build will contain the **default** configuration.
You can **use** it, **rewrite** the code or **add** other modules **within the license**.

## Development

Run both sides in two terminals from the repository root:

    npm run dev:server    # Express on http://localhost:3000
    npm run dev:client    # Angular on http://localhost:4200, /api is proxied to Express

Open http://localhost:4200. A request to /api/_core/health returns the server status.
