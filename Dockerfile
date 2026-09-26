FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/payment-processing-simulator-0.1.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
