package com.example.payment;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class PaymentServiceTest {

  private final PaymentService service = new PaymentService();

  @Test
  public void calculateTotal_multiply() {
    assertEquals(new BigDecimal("25.00"), service.calculateTotal(new BigDecimal("5.00"), 5));
  }

  @Test
  public void calculateTotal_nullAmount_throws() {
    assertThrows(IllegalArgumentException.class, () -> service.calculateTotal(null, 1));
  }

  @Test
  public void resolveStatus_completed() {
    assertEquals("COMPLETED", service.resolveStatus(true, true));
  }
}
