#!/bin/bash
if sunsetr status | grep -q "stable"; then
  sunsetr stop
else
  sunsetr preset on
fi
