package com.jswone.experiencemiddleware.property;

import java.util.Objects;

public record HttpClientProperty(
    String uri, int connectTimeout, int socketTimeout, int connReqTimeOut, int maxConnections) {
  public HttpClientProperty {
    Objects.requireNonNull(uri);
  }
}
