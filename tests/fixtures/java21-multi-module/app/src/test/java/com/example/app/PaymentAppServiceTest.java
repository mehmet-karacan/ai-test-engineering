package com.example.app;

import com.example.core.PaymentRecord;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class PaymentAppServiceTest {

  private final PaymentAppService service = new PaymentAppService();

  @Test
  public void describe_display() {
    assertEquals("p1: 100", service.describe(new PaymentRecord("p1", 100)));
  }

  @Test
  public void describe_null_throws() {
    assertThrows(IllegalArgumentException.class, () -> service.describe(null));
  }
}
