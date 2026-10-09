package com.example.legacy;

import org.junit.Test;
import java.util.Arrays;
import java.util.List;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class LegacyInventoryTest {

  private final LegacyInventory inventory = new LegacyInventory();

  @Test
  public void filterByPrefix_matches() {
    List<String> result = inventory.filterByPrefix(Arrays.asList("pay-1", "ord-2", "pay-3"), "pay-");
    assertEquals(2, result.size());
  }

  @Test
  public void filterByPrefix_nullItems_returnsEmpty() {
    assertTrue(inventory.filterByPrefix(null, "pay-").isEmpty());
  }

  @Test
  public void clamp_insideBounds() {
    assertEquals(5, inventory.clamp(5, 0, 10));
  }
}
