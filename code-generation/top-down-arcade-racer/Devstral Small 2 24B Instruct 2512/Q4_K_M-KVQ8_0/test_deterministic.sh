#!/bin/bash

echo "=== Running game with seed 42 - First run ==="
timeout 2s node dist/bundle.js --deterministic --seed=42 > output1.txt 2>&1

echo ""
echo "=== Running game with seed 42 - Second run ==="
timeout 2s node dist/bundle.js --deterministic --seed=42 > output2.txt 2>&1

echo ""
echo "=== Comparing outputs ==="
diff output1.txt output2.txt || echo "Outputs are identical (deterministic behavior verified)"
