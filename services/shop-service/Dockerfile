FROM oven/bun:1-alpine

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
EXPOSE 3004

# Apply pending migrations before booting: the shared postgres instance only
# auto-creates the `careleo` database, so careleo_shop starts out empty and
# every query would fail with "relation products does not exist".
CMD ["sh", "-c", "bun run db:migrate && bun run src/index.ts"]
