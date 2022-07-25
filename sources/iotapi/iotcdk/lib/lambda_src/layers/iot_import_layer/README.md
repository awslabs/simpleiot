# iot\_import\_layer 

The lambda import layer needed for SimpleIOT is constructed at install time. However, the lambda python version may not be the same as the one running on the user's machine.

The solution is to run the layer-building script in a version of Docker that has the python version supported by lambda.

The script `buildlayer.sh` does this. 

It assumes the Docker Desktop is running on the current machine (and checks for it).

The script gets invoked by the installer command. It downloads the container running the supported version of Python, then installs the pre-requisites needed by lambda (in `requirements.txt`) and compresses the libraries in the way lambda expects it.

It then copies the file back out to the calling host, where it can be picked up by the installer.

The output file will be installed in `out/iot_import_layer.zip` where it will be used by the CDK when creating lambda layers.