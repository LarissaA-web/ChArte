# Estágio de Build (Compilação)
FROM maven:3.9.9-eclipse-temurin-25 AS build
COPY . .
RUN mvn clean package -DskipTests

# Estágio de Execução (Roda o JAR pequeno)
FROM eclipse-temurin:25-jdk-alpine
COPY --from=build /target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
