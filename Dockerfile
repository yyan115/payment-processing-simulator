FROM node:22-alpine AS frontend
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9.15-eclipse-temurin-26 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn --batch-mode dependency:go-offline
COPY src src
COPY --from=frontend /ui/dist/ src/main/resources/static/
RUN mvn --batch-mode -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl \
    && addgroup -S app \
    && adduser -S -G app app
WORKDIR /app
COPY --from=build --chown=app:app \
    /workspace/target/payment-processing-simulator-0.1.0-SNAPSHOT.jar app.jar
COPY --chown=app:app docs/examples/mastercard-sandbox-parties.json /app/examples/mastercard-sandbox-parties.json
COPY --chmod=755 ops/docker/entrypoint.sh /app/entrypoint.sh
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65 -XX:+UseSerialGC"
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
    CMD curl --fail --silent --show-error "http://localhost:${PORT:-8080}/actuator/health" > /dev/null || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
