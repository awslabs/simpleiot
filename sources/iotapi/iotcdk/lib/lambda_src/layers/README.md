# Lambda Layers

To recreate the lambda layers needed here, you first need to create the directory structure
expected by lambda runtime. Make sure you use the python version the lambda will be running
under:

```
% mkdir -p layers/iot_import_layer/python/lib/python3.8/site-packages
```

Next, install all the packages you will need in the specific folder:

```
pip install requests -t layers/iot_import_layer/python/lib/python3.8/site-packages/
```
`
Then zip the lambda layers folder:

```
% cd layers/iot_import_layer
% zip -r iot_import_layer python -x "*__pycache__/*" "*.pyc" "*/.DS_Store"
```

The top-level of the zip folder has to be the _python_ directory. We also want to exclude the python compiled bytecode/cached
files as well as (if on a Mac) the .DS_Store finder files.

Next, you can upload it to lambda using the console or use the CDK to create the layer. These
can be loaded normally using the python ```import``` function.

To create an application level one with only your own code:

```
% mkdir -p mylayer/python/lib/python3.8/site-packages
```

Then go into that directory and create a directory for your module and add an \_\_init.py\_\_
so python can import it:

```
% cd mylayer/python/lib/python3.8/site-packages
% mkdir mymodule
% touch mymodule/__init__.py
```

Now you can add your python source files inside the ```mymodule`` folder. For example:

```
% cp database.py {path-to}/mymodule
```

Once done, go back to the ```mylayer`` directory, and as before, create a zip archive.

```
% zip -r mylayer python -x "*__pycache__/*" "*.pyc" "*/.DS_Store"
```

The top-level of the zip archive should be the _python_ directory. Add the zip archive
to Lambda layers, then add the layer to the lambda.

To use it in your lambda, you can use:

```
from mymodule.database import *
```
or
```
import mymodule.database
```

Again, it's important that the _python/lib/python{version}_ directory match the version
of Python specified when creating the lambda.
