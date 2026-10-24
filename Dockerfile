# Match the Playwright version in package.json and the browser Docker image.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY . .
# Build and run in the same official Playwright browser image.
RUN npm install --no-audit --no-fund && npm run typecheck && npm run build
RUN chown -R pwuser:pwuser /app
USER pwuser
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "node_modules/.bin/next start --hostname 0.0.0.0 --port $PORT"]
