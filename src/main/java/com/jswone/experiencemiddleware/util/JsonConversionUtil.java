package com.jswone.experiencemiddleware.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import com.jswone.experiencemiddleware.exception.CustomException;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;

@UtilityClass
@Slf4j
public class JsonConversionUtil {
  private static ObjectMapper mapper;

  public static void setObjectMapper(ObjectMapper objectMapper) {
    mapper = objectMapper;
  }

  public byte[] toJsonBytes(Object obj) throws IOException {
    ObjectMapper objectMapper = new ObjectMapper();
    return objectMapper.writeValueAsBytes(obj);
  }

  public byte[] toJsonBytesSilently(Object obj) {
    try {
      return toJsonBytes(obj);
    } catch (IOException e) {
      log.info(e.getMessage());
      throw new CustomException(ErrorCode.JSON_CONVERSION_ERROR);
    }
  }
}
