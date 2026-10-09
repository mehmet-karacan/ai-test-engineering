package com.example.core;

public record PaymentRecord(String id, long amount) {
  public PaymentRecord {
    if (amount < 0) {
      throw new IllegalArgumentException("amount negatif olamaz");
    }
  }

  public String display() {
    return id + ": " + amount;
  }
}
