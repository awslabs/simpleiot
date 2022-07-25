# SimpleIOT Backend API

This is the source for common back-end API for all projects. It implements the database schema,
the lambdas, and the APIs needed to manage projects and devices.

The _iot_ Command-Language-Interface (CLI) talks to the API implemented here to manage the components needed for it to
operate.

The Backend API consists of lambdas that do the work, as well as a CDK script that 
builds the cloud-based infrastructure surrounding the lambdas. There are two sets of scripts. One for the
global SimpleIOT system, which is installed when the user first runs 'iot firstlaunch' and another, each time a new
project is created.

## Requirements

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html).
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html).
- [NPM](https://docs.npmjs.com/about-npm).
- [Python 3.7 or higher](https://www.python.org/)
- [Pip for python 3](https://stackoverflow.com/questions/6587507/how-to-install-pip-with-python-3)
- [Invoke/PyInvoke](http://www.pyinvoke.org/): Task execution tool and library.

Before installing Invoke, you will want to create a Python virtual environment.

```
% python -m venv venv
% source venv/bin/activate
% pip install -r requirements.txt
```

These are not needed for installation of the system. However, they are used extensively 
and the links are here for educational reference.

- [Pony ORM](https://ponyorm.org/): Database ORM.
- [Boto3](https://github.com/boto/boto3): Official AWS Python SDK.

## Before Installation

Make sure you install all the above pre-requisites (invoke, npm, AWS CDK, AWS CLI, etc.)
are installed.

If using AWS Single-Sign-On (SSO), you can skip the below step and obtain the SSO login 
credentials from your IT staff. You will need at least:

- The start URL for your SSO
- The AWS region name for the SSO

If NOT using SSO, then you will need to log into your AWS Console and create a user ID
with programmatic access to AWS and sufficient privileges to install AWS services. 

Once done, in the terminal shell run the following and enter your Access Key and 
Access Secret credentials obtained from the console user registration page:

    aws configure

Login to your AWS account with Admin credentials. If planning on handling multiple 
accounts, make sure you assign a *profile name*.

## Installation

Once ready to start, in terminal run:

```
   source venv/bin/activate
   invoke --list
```

The output should look like this:

```
Available tasks:

  bootstrap
  cdkupdate
  clean
  dbsetup
  deploy
  install
  mergetest
  nodeupdate
  upload
```

If everything is installed properly, this should list out the commands available during
installation.
```
   invoke bootstrap
```

This asks a series of questions, then sets up the system for initial install.

When done, let's run the back-end deployment:
```
    invoke deploy {team-name}
```

This reads the values from the bootstrap stage, then creates all the back-end services.
This will take a while. When done, and if successful, now you can initialize the database:
```
    invoke dbsetup {team}
```

Note that this erases your entire database and re-creates it with test data.
Be VERY careful if you decide to re-run this.

If you elected NOT to use SSO, it will also put out warning messages if run more 
than once and the Cognito users have already  been created. To re-create the users, 
go into the AWS console under Cognito User Pools,  select the user-pool name and 
under Users, disable, then delete each user, then re-run the *dbstart* command.

The default data is taken out of the *db/dbdata.json* file. If you want to experiment with
other values, you can modify the data there then re-load the data using `invoke dbsetup {team}`

Once this is done, you can log in using the `simpleiot-cli` and the `auth login` command.

This will log you into the account using an authenticated user.
Now you should have the credentials to be able to run commands.

To make life easier, you can set an environment variable with your chosen
Team name.

    % export IOT_TEAM={name-of-team}

If not specified, the default will be *simpleiot*.

    % iot project list

You should see a demo project listed. If this works, you're ready to go.

## Configuration Files

All installation, configuration, and runtime data is in the `~/.simpleiot`
directory under folders with the name of each team.

## Cleaning up

To clean up the installation and delete all services, run:

    % invoke clean --team {team-name}



