FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
