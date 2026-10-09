package com.example.legacy;

import java.util.ArrayList;
import java.util.List;

public class LegacyInventory {

  public List<String> filterByPrefix(List<String> items, String prefix) {
    List<String> result = new ArrayList<String>();
    if (items == null || prefix == null) {
      return result;
    }
    for (String item : items) {
      if (item != null && item.startsWith(prefix)) {
        result.add(item);
      }
    }
    return result;
  }

  public int clamp(int value, int min, int max) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }
}
