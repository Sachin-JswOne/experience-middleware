package com.jswone.experiencemiddleware.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import com.jswone.experiencemiddleware.exception.CustomException;
import java.io.IOException;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@UtilityClass
@Slf4j
public class JsonConversionUtil {
  private static ObjectMapper objectMapper;

  public static void setObjectMapper(ObjectMapper objectMapper) {
    JsonConversionUtil.objectMapper = objectMapper;
  }

  public byte[] toJsonBytes(Object obj) throws IOException {
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

  public String toJsonString(Object obj) throws IOException {
    return objectMapper.writeValueAsString(obj);
  }

  public String toStringSilently(Object obj) {
    try {
      return toJsonString(obj);
    } catch (IOException e) {
      log.info(e.getMessage());
      throw new CustomException(ErrorCode.JSON_CONVERSION_ERROR);
    }
  }
}
