package com.jswone.experiencemiddleware.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.jswone.experiencemiddleware.util.JsonConversionUtil;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ObjectMapperConfig {

  public ObjectMapperConfig(ObjectMapper objectMapper) {
    objectMapper.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);
    objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    objectMapper.configure(
        DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE, true);
    JsonConversionUtil.setObjectMapper(objectMapper);
  }
}
