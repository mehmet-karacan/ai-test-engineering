package com.example.calc;

public class CalcService {

  public int add(int a, int b) {
    if (a == Integer.MAX_VALUE && b > 0) {
      throw new IllegalArgumentException("overflow");
    }
    if (b == Integer.MAX_VALUE && a > 0) {
      throw new IllegalArgumentException("overflow");
    }
    return a + b;
  }

  public int multiply(int a, int b) {
    return a * b;
  }

  public String sign(int value) {
    if (value > 0) {
      return "positive";
    }
    if (value < 0) {
      return "negative";
    }
    return "zero";
  }
}
