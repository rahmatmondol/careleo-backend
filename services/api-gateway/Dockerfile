FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose Gateway Port
EXPOSE 3000

# Run the app
CMD ["bun", "run", "src/index.ts"]
