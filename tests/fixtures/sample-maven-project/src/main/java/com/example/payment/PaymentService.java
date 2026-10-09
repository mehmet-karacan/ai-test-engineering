package com.example.payment;

import java.math.BigDecimal;

public class PaymentService {

  public BigDecimal calculateTotal(BigDecimal amount, int quantity) {
    if (amount == null) {
      throw new IllegalArgumentException("amount null olamaz");
    }
    if (quantity <= 0) {
      throw new IllegalArgumentException("quantity pozitif olmali");
    }
    return amount.multiply(BigDecimal.valueOf(quantity));
  }

  public String resolveStatus(boolean paid, boolean shipped) {
    if (paid && shipped) {
      return "COMPLETED";
    }
    if (paid) {
      return "PAID";
    }
    return "PENDING";
  }
}
