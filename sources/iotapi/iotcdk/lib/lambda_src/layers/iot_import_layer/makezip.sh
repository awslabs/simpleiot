#!/bin/bash

OUTPUT_ZIP="iot_import_layer.zip"

rm -f "${OUTPUT_ZIP}"
zip -r ${OUTPUT_ZIP} python -x "*__pycache__/*" "*.pyc" "*/.DS_Store"
echo "Zip done. Output in: ${OUTPUT_ZIP}"
