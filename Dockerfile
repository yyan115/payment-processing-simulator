FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn --batch-mode dependency:go-offline
COPY src src
RUN mvn --batch-mode -DskipTests package

FROM eclipse-temurin:24-jre-alpine
RUN apk add --no-cache curl \
    && addgroup -S app \
    && adduser -S -G app app
WORKDIR /app
COPY --from=build --chown=app:app \
    /workspace/target/payment-processing-simulator-0.1.0-SNAPSHOT.jar \
    app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl --fail --silent --show-error http://localhost:8080/actuator/health > /dev/null || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
