FROM node:22-alpine

WORKDIR /app
RUN chown node:node /app

# Copy dependency configuration and install packages
COPY --chown=node:node package*.json ./

USER node
RUN npm ci --omit=dev

# Copy application source files explicitly to avoid baking secrets like .env into the image
COPY --chown=node:node main.js helper.js ./
COPY --chown=node:node lib/ ./lib/
COPY --chown=node:node tools/ ./tools/
COPY --chown=node:node docs/ ./docs/

# Create a symbolic link to point to Docker Secrets at runtime.
# Dotenv will load environment variables from this secret if provided.
RUN ln -sf /run/secrets/app_env /app/.env

EXPOSE 3000

CMD ["npm", "run", "dev"]