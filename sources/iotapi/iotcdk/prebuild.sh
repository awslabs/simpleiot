# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# Bash script to perform pre-build steps needed before we invoke the CDK
#
cd lib/lambda_src/layers/iot_import_layer
./buildlayer.sh
