package com.jswone.experiencemiddleware.response;

import com.jswone.experiencemiddleware.constant.ApplicationConstants;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import lombok.Data;
import org.slf4j.MDC;

@Data
public class ResponseObject<T> {

  private boolean result;
  private T data;
  private String requestId;
  private String errorCode;
  private String errorMessage;

  public ResponseObject(T data) {
    this.requestId = MDC.get(ApplicationConstants.TRACE_ID);
    this.result = true;
    this.data = data;
  }

  public ResponseObject(ErrorCode errorCode) {
    this(errorCode.getCode(), errorCode.getMessage());
  }

  public ResponseObject(String errorCode, String errorMessage) {
    this.requestId = MDC.get(ApplicationConstants.TRACE_ID);
    this.result = false;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
  }
}
