package com.example.app;

import com.example.core.PaymentRecord;

public class PaymentAppService {
  public String describe(PaymentRecord record) {
    if (record == null) {
      throw new IllegalArgumentException("record null olamaz");
    }
    return record.display();
  }
}
