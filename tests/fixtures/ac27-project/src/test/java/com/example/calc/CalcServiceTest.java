package com.example.calc;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class CalcServiceTest {

  private final CalcService service = new CalcService();

  @Test
  public void add_positive() {
    assertEquals(8, service.add(3, 5));
  }
}
