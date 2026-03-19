#!/bin/bash
# Check if any other files need this update
grep -ri "new Response" src/ | grep error
