# SimpleIOT Installer

The installer is run the first time SimpleIOT is downloaded and installed into an account.
The installation is run from the Makefile using the `make install` command.

The script is in python and runs in a series of phases:

- Check for apps that need to be present:
      - NPM
      - Node.js
      - AWS CLI
      - AWS CDK
      - CMake
- If not there, we launch a browser window to the installer pages for each one.
- When returned from installer, we check again to see if the item is installed. If yes, we continue.
- For each app, we also check to see if the version meets our minimum requirement. 
  If no match we offer to launch the update page (these might need to be hosted if not kept in the same place).
Next step is to create a python virtual environment and install the pre-requisites:
  
% python3 -m venv  ./venv
% source venv/bin/activate
% pip install -r requirements.txt

- If everything OK, the installer proceeds to ask startup questions needed to bootstrap SimpleIOT:
    - AWS Profile (default, any others, or if not provided, offer to branch out and refresh). 
      If no 'default' value found, require one to be entered.
    - Organization Name
    - Team name (defaults to the AWS profile name)
- The installer writes the data into a bootstrap.json file in the root directory. This is used
by the CDK to setup and initialize values.
- At this point, the CDK will run and create the basic settings (this will take a while). 
  We do this by launching the Makefile for stage 1.
- This creates the various services and places the output into a JSON file.
- Next, we run a Node.js script that updates the settings in the parameter store/secrets manager.
- It also runs a config template updated which creates JSON files for other parts of the system with settings.
- This also copies all the consolidated settings into a JSON file and parameter store.
- With these settings (for example end-point of API gateway and IOT endpoints), another Makefile state
is run. This builds the dashboard binary, uploads it to the S3 bucket, and invalidates the Cloudfront distribution.
- We wait until the invalidation is done (or check in a loop using AWS CLI).
- At this point, they should be able to launch the dashboard and log in using `iot dash`.

If any of these steps fail, we need a way to be able to reset things back to an initial state.
This can be done via the `make clean` command.

Note that this command needs to be run by someone with proper administrative access to the account. 
If they don't have full access, parts of the install may fail.

Note that only the same account will be able to install specific features (to run CDK scripts) and modify the cloud settings.
To switch to a different individual, the existing settings need to be archived and migrated to a new machine.

To bootstrap CDK using the new templates:

export CDK_NEW_BOOTSTRAP=1
cdk bootstrap aws://214626307324/us-west-2 --profile=simpleiot-demo
