package com.jswone.experiencemiddleware.exception;

import com.jswone.experiencemiddleware.constant.ErrorCode;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatusCode;

@AllArgsConstructor
@Getter
public class CustomException extends RuntimeException {

  private final String errorCode;
  private final String errorMessage;
  private final HttpStatusCode httpStatus;

  public CustomException(ErrorCode errorCode) {
    this.errorCode = errorCode.getCode();
    this.errorMessage = errorCode.getMessage();
    this.httpStatus = errorCode.getHttpStatus();
  }

  public CustomException(String responseCode, String responseMessage) {
    this(responseCode, responseMessage, HttpStatusCode.valueOf(500));
  }
}
