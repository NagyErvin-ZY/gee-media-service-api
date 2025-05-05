# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manager files
COPY package.json yarn.lock ./

# Copy .npmrc from build context (user must copy $HOME/.npmrc to project root before build)
COPY .npmrc /root/.npmrc

# Install dependencies using .npmrc, then remove it
RUN yarn install --frozen-lockfile && rm -f /root/.npmrc

COPY . .
RUN yarn build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]