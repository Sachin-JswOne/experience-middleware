package com.jswone.experiencemiddleware.property;

import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
@Getter
@Setter
public class ApplicationProperty {

  @Value("${application.allowed-origins:*}")
  private List<String> allowedOrigins;

  @Value("${application.allowed-methods:GET,POST,PUT,DELETE,OPTIONS}")
  private List<String> allowedMethods;

  @Value("${application.allowed-headers:*}")
  private List<String> allowedHeaders;

  @Value(
      "${application.open-paths:/api/public/**, /api/docs/**, /api/swagger-ui/**, /api/v3/api-docs/**, '/actuator' ,/actuator/**}")
  private List<String> openPaths;
}
