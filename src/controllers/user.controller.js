import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const generateAccessAndRefreshToken = async (userId) => {
   try {
      const user = await User.findById(userId);
      const accessToken = user.generateAccessToken();
      const refreshToken = user.generateRefreshToken();

      user.refreshToken = refreshToken; //token saved in user

      await user.save({ validateBeforeSave: false }); //token saved in Db.
      //validateBeforeSave is used because using save method, all fields of model will be kick-in as we are changing only one field, so we need this validateBeforeSave=false
      return { accessToken, refreshToken };
   } catch (error) {
      throw new ApiErrors(
         500,
         "Something went wrong while generating Access and Refresh tokens"
      );
   }
};

const registerUser = asyncHandler(async (req, res) => {
   //get the user details
   //check weather empty or not
   //check weather user already exist? username, email
   //check for images and avatar
   //upload them to cloudinary ,
   //create a user object- store in db
   //check for creation
   //encrypted password and refresh token field removal
   //return the response

   const { username, email, fullName, password } = req.body;
   console.log("body", req.body);
   if (
      [username, email, fullName, password].some(
         (field) => field?.trim() === ""
      )
   ) {
      throw new ApiErrors(400, "All fields are required");
   }
   const existedUser = await User.findOne({
      $or: [{ username }, { email }],
   });
   if (existedUser) {
      throw new ApiErrors(409, "User with Email or username already exist");
   }
   console.log("files", req.files); //middleware accessibilty through req.files

   const avatarLocalFilePath = req.files?.avatar[0]?.path;

   // let avatarLocalFilePath;
   // if (
   //    req.files &&
   //    Array.isArray(req.files.avatar) &&
   //    req.files.avatar.length > 0
   // ) {
   //    avatarLocalFilePath = req.files.avatar[0]?.path;
   // }

   // const coverLocalFilePath = req.files?.coverImage[0]?.path;
   //we might get the undefined error at this point, mistake of Js not Node
   let coverLocalFilePath;
   if (
      req.files &&
      Array.isArray(req.files.coverImage) &&
      req.files.coverImage.length > 0
   ) {
      coverLocalFilePath = req.files.coverImage[0]?.path;
   }
   if (!avatarLocalFilePath) {
      throw new ApiErrors(400, "Avatar file is required");
   }

   const avatar = await uploadToCloudinary(avatarLocalFilePath);
   const coverImage = await uploadToCloudinary(coverLocalFilePath);

   if (!avatar) {
      throw new ApiErrors(400, "Avatar file is required");
   }

   const user = await User.create({
      email,
      password,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      username: username.toLowerCase(),
      fullName,
   });

   const createdUser = await User.findById(user._id).select(
      "-password -refreshToken" //to remove such fields, this is the syntax
   );

   if (!createdUser) {
      throw new ApiErrors(
         500,
         "Internal Server Error while Registering the User"
      );
   }

   return res
      .status(201)
      .json(new ApiResponse(200, createdUser, "User Registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
   //getting data from req.body
   //username or email
   //check weather user exist or not
   //if exist, then check for the password correction
   //access and refreshtoken
   //send via cookies

   const { username, email, password } = req.body;

   if (!username || !email) {
      throw new ApiErrors(400, "Username or Email is required");
   }

   const user = await User.findOne({
      $or: [{ username }, { email }],
   });

   if (!user) {
      throw new ApiErrors(404, "User doesnot exist");
   }

   const isPasswordValid = await user.isPasswordCorrect(password);

   if (!isPasswordValid) {
      throw new ApiErrors(401, "Invalid User credentials");
   }

   const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
   );
   //now method is defined somewhere else, we have the refrence of 125 user, which has nothing
   //either we can update it or else we can once again call the database to save those details

   const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken"
   );

   const options = {
      httpOnly: true,
      secure: true,
   };

   return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, { httpOnly: true, secure: true })
      .json(
         new ApiResponse(
            200,
            {
               user: loggedInUser,
               accessToken,
               refreshToken, // why again sending the tokens to the user? in case if user wants to save it into local-storage, or in mobile application where cookies won't work, so better to send
            },
            "User Logged in Successfully"
         )
      );
});

//we don't know who the user is, we'll verify it by middleware and from there we'll check the tokens from cookes or header and take the id with us
const logoutUser = asyncHandler(async (req, res) => {
   //req.user._id; // my user id, I will access the whole object and delete the refreshtoken
   await User.findByIdAndUpdate(
      req.user._id,
      {
         $set: {
            refreshToken: undefined,
         },
      },
      {
         new: true,
      } // in response, we will get the new updated value, not the old
   );

   const options = {
      httpOnly: true,
      secure: true,
   };

   return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(new ApiResponse(200, {}, "User LoggedOut"));
});

//User -> this one is a mongoose object so all the methods like findById, findOne will be accessed by User
//but userdefine method will not be accessed by this object
//accesstoken, refreshtoken will be with the user that we have accessed through mongoDb which is 'user'

export { registerUser, loginUser, logoutUser };
