FROM oven/bun:1-alpine

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
EXPOSE 3017

CMD ["bun", "run", "src/index.ts"]
