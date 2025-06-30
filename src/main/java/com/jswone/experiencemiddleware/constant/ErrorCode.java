package com.jswone.experiencemiddleware.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatusCode;

@RequiredArgsConstructor
@Getter
public enum ErrorCode {
    BAD_REQUEST(4000, "Bad request", HttpStatusCode.valueOf(400)),

    UNAUTHORIZED(4010, "Invalid API Key", HttpStatusCode.valueOf(401)),

    FORBIDDEN(4030, "Missing API Key", HttpStatusCode.valueOf(403)),

    NOT_FOUND(4040, "Not found", HttpStatusCode.valueOf(404)),

    INTERNAL_SERVER_ERROR(5000, "Internal Server Error", HttpStatusCode.valueOf(500)),
    JSON_CONVERSION_ERROR(5001, "Unable to perform conversion", HttpStatusCode.valueOf(500)),

    SERVICE_UNAVAILABLE(5030, "Service Unavailable", HttpStatusCode.valueOf(503));

    private final int code;
    private final String message;
    private final HttpStatusCode httpStatus;

    public String getCode() {
        return ApplicationConstants.ERROR_CODE_PREFIX + code;
    }
}
